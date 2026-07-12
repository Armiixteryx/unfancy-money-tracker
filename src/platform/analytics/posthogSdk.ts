import type { AnalyticsEvent, AnalyticsProperties } from "./types";

export type PostHogSdkConfig = { apiKey: string | undefined; host: string; appVersion: string };

export interface PostHogSdk {
  initialize(): Promise<void>;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
  identify(accountSubject: string): Promise<void>;
  capture(event: AnalyticsEvent, properties: AnalyticsProperties): Promise<void>;
  providerClient?: unknown;
}

export function createPostHogSdk(_config: PostHogSdkConfig): PostHogSdk | null {
  return null;
}
