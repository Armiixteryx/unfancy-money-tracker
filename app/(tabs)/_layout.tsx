import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { AppTabBar } from "../../src/ui/AppTabBar";
import { colors } from "../../src/ui/theme";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarStyle: Platform.OS === "web" ? { display: "none" } : { backgroundColor: colors.surface, borderTopColor: colors.border, height: 76, paddingTop: 8 }
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarLabel: "Dashboard" }} />
      <Tabs.Screen name="transactions" options={{ title: "Transactions", tabBarLabel: "Transactions" }} />
      <Tabs.Screen name="budgets" options={{ title: "Budgets", tabBarLabel: "Budgets" }} />
      <Tabs.Screen name="reports" options={{ title: "Reports", tabBarLabel: "Reports" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarLabel: "Settings" }} />
    </Tabs>
  );
}
