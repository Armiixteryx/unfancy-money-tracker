import { i18n } from "../../src/localization/i18n";
import { useTranslation } from "react-i18next";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { AppTabBar } from "../../src/ui/AppTabBar";
import { useAppTheme } from "../../src/ui/theme";

export default function TabLayout() {
  useTranslation();
  const { colors } = useAppTheme();
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
        tabBarStyle: Platform.OS === "web" ? { display: "none" } : { backgroundColor: colors.surface, borderTopColor: colors.border, height: 76, paddingTop: 8 }
      }}
    >
      <Tabs.Screen name="index" options={{ title: i18n.t($ => $.ui.navigationDashboard), tabBarLabel: i18n.t($ => $.ui.navigationDashboard) }} />
      <Tabs.Screen name="transactions" options={{ title: i18n.t($ => $.ui.navigationTransactions), tabBarLabel: i18n.t($ => $.ui.navigationTransactions) }} />
      <Tabs.Screen name="budgets" options={{ title: i18n.t($ => $.ui.navigationBudgets), tabBarLabel: i18n.t($ => $.ui.navigationBudgets) }} />
      <Tabs.Screen name="reports" options={{ title: i18n.t($ => $.ui.navigationReports), tabBarLabel: i18n.t($ => $.ui.navigationReports) }} />
      <Tabs.Screen name="settings" options={{ title: i18n.t($ => $.ui.navigationSettings), tabBarLabel: i18n.t($ => $.ui.navigationSettings) }} />
    </Tabs>
  );
}
