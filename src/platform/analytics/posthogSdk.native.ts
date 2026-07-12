import PostHog from "posthog-react-native";

import type { AnalyticsEvent, AnalyticsProperties } from "./types";
import type { PostHogSdk, PostHogSdkConfig } from "./posthogSdk";

export function createPostHogSdk(config: PostHogSdkConfig): PostHogSdk | null {
  if (!config.apiKey) return null;
  const client = new PostHog(config.apiKey, {
    host: config.host,
    captureAppLifecycleEvents: true,
    enableSessionReplay: true,
    enablePersistSessionIdAcrossRestart: true,
    sessionReplayConfig: { maskAllTextInputs: true, maskAllImages: true, captureLog: false, sampleRate: 1 },
    customAppProperties: { $app_version: config.appVersion }
  });
  return {
    providerClient: client,
    async initialize() { await client.ready(); await client.optOut(); },
    async optIn() { await client.optIn(); await client.startSessionRecording(); },
    async optOut() { await client.stopSessionRecording(); await client.optOut(); },
    async identify(accountSubject: string) { client.identify(accountSubject); },
    async capture(event: AnalyticsEvent, properties: AnalyticsProperties) { client.capture(event, properties); }
  };
}
