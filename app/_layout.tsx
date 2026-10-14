import { Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "../src/providers/AppProviders";
import { useAppTheme } from "../src/ui/theme";
import { webBrandForEnvironment } from "../src/platform/runtime/webBrand";

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
  const brand = webBrandForEnvironment(process.env.EXPO_PUBLIC_ENV);
  return (
    <>
      <Head><title>{brand.name}</title></Head>
      <AppProviders>
        <ThemedApp />
      </AppProviders>
    </>
  );
}
