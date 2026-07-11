import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { colors } from "../../src/ui/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarStyle:
          Platform.OS === "web"
            ? {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRightWidth: 1,
                height: "100%",
                left: 0,
                paddingTop: 24,
                position: "absolute",
                top: 0,
                width: 232
              }
            : { backgroundColor: colors.surface, borderTopColor: colors.border, height: 76, paddingTop: 8 }
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

