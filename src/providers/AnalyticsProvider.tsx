import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from "react";

import { createPostHogAnalyticsClient } from "../platform/analytics";
import type { AnalyticsClient } from "../platform/analytics";
import { PostHogProviderWrapper } from "../platform/analytics/PostHogProviderWrapper";

const noopAnalytics: AnalyticsClient = {
  initialize: async () => undefined,
  setConsent: async () => undefined,
  identifyAccount: async () => undefined,
  capture: async () => undefined
};

const AnalyticsContext = createContext<AnalyticsClient>(noopAnalytics);

export function AnalyticsProvider({ children }: PropsWithChildren) {
  const client = useMemo(() => createPostHogAnalyticsClient(), []);
  useEffect(() => {
    void client.initialize();
  }, [client]);
  return <AnalyticsContext.Provider value={client}><PostHogProviderWrapper client={client.getProviderClient()}>{children}</PostHogProviderWrapper></AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsClient {
  return useContext(AnalyticsContext);
}
