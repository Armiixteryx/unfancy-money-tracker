import { SyncProvider } from "../features/sync/SyncProvider";
import { AuthProvider } from "../features/auth/AuthProvider";
import { LocalizationProvider } from "../localization/LocalizationProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { VoiceProvider } from "../features/voice/VoiceProvider";
import { DatasetHydrationGate } from "./DatasetHydrationGate";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { AppThemeProvider } from "../ui/theme";
import { AppFonts } from "../ui/AppFonts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000
    }
  }
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider><AnalyticsProvider>
        <AppThemeProvider><AppFonts>
          <AuthProvider><SyncProvider><DatasetHydrationGate><VoiceProvider>{children}</VoiceProvider></DatasetHydrationGate></SyncProvider></AuthProvider>
        </AppFonts></AppThemeProvider>
      </AnalyticsProvider></LocalizationProvider>
    </QueryClientProvider>
  );
}
