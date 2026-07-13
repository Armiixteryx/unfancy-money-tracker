import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "../src/providers/AppProviders";
import { useAppTheme } from "../src/ui/theme";

function ThemedApp() {
  const { colors, resolvedTheme } = useAppTheme();
  return (
    <>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="developer-seed" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <ThemedApp />
    </AppProviders>
  );
}
