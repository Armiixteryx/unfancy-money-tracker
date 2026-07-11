import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "../src/app/providers/AppProviders";

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AppProviders>
  );
}

