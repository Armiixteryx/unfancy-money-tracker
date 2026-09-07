import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from "react";

import { createPostHogAnalyticsClient } from "../platform/analytics";
import type { AnalyticsClient } from "../platform/analytics";
import { PostHogProviderWrapper } from "../platform/analytics/PostHogProviderWrapper";
import { useLocalDatasetStore } from "../features/local-data/store/useLocalDatasetStore";

const noopAnalytics: AnalyticsClient = {
  initialize: async () => undefined,
  setConsent: async () => undefined,
  capture: async () => undefined
};

const AnalyticsContext = createContext<AnalyticsClient>(noopAnalytics);

export function AnalyticsProvider({ children }: PropsWithChildren) {
  const client = useMemo(() => createPostHogAnalyticsClient(), []);
  const analyticsConsent = useLocalDatasetStore((state) => state.dataset?.preferences.analyticsConsent);
  useEffect(() => {
    void client.initialize();
  }, [client]);
  useEffect(() => {
    if (analyticsConsent !== undefined) void client.setConsent(analyticsConsent);
  }, [analyticsConsent, client]);
  return <AnalyticsContext.Provider value={client}><PostHogProviderWrapper client={client.getProviderClient()}>{children}</PostHogProviderWrapper></AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsClient {
  return useContext(AnalyticsContext);
}
