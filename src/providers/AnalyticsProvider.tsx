import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from "react";

import { createPostHogAnalyticsClient } from "../platform/analytics";
import type { AnalyticsClient } from "../platform/analytics";

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
  return <AnalyticsContext.Provider value={client}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsClient {
  return useContext(AnalyticsContext);
}
