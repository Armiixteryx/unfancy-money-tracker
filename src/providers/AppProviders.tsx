import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import { DatasetHydrationGate } from "./DatasetHydrationGate";
import { AnalyticsProvider } from "./AnalyticsProvider";

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
        <DatasetHydrationGate>{children}</DatasetHydrationGate>
      </AnalyticsProvider>
    </QueryClientProvider>
  );
}
