import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { VoiceProvider } from "../features/voice/VoiceProvider";
import { DatasetHydrationGate } from "./DatasetHydrationGate";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { AppThemeProvider } from "../ui/theme";

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
      <AnalyticsProvider>
        <AppThemeProvider>
          <DatasetHydrationGate><VoiceProvider>{children}</VoiceProvider></DatasetHydrationGate>
        </AppThemeProvider>
      </AnalyticsProvider>
    </QueryClientProvider>
  );
}
