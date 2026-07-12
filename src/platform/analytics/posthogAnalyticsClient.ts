import { ANALYTICS_EVENTS, REPLAY_MASKING_SELECTORS, type AnalyticsClient, type AnalyticsEvent, type AnalyticsIdentityStore, type AnalyticsProperties } from "./types";
import { createPostHogSdk, type PostHogSdk } from "./posthogSdk";
import { createUuid } from "../identifiers/createUuid";

const IDENTITY_KEY = "unfancy.analytics.distinct_id";
const ALLOWED_PROPERTIES = ["platform", "appVersion", "surface", "actionResult", "errorCode", "syncStatus"] as const;

export class RuntimeAnalyticsIdentityStore implements AnalyticsIdentityStore {
  private memoryValue: string | null = null;

  async get(): Promise<string | null> {
    if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage.getItem(IDENTITY_KEY);
    try {
      const secureStore = await import("expo-secure-store");
      return await secureStore.getItemAsync(IDENTITY_KEY);
    } catch {
      return this.memoryValue;
    }
  }

  async set(value: string): Promise<void> {
    this.memoryValue = value;
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(IDENTITY_KEY, value);
      return;
    }
    try {
      const secureStore = await import("expo-secure-store");
      await secureStore.setItemAsync(IDENTITY_KEY, value);
    } catch {
      // Memory fallback keeps the default local loop functional without logging identity data.
    }
  }
}

type PostHogConfig = { apiKey: string | undefined; host?: string; platform: "web" | "ios" | "android"; appVersion: string; identityStore?: AnalyticsIdentityStore; fetcher?: typeof fetch; sdk?: PostHogSdk | null };

export class PostHogAnalyticsClient implements AnalyticsClient {
  private readonly host: string;
  private readonly identityStore: AnalyticsIdentityStore;
  private readonly fetcher: typeof fetch;
  private distinctId: string | null = null;
  private consent = false;
  private accountSubject: string | null = null;
  private readonly sdk: PostHogSdk | null;

  constructor(private readonly config: PostHogConfig) {
    this.host = (config.host ?? "https://us.i.posthog.com").replace(/\/$/, "");
    this.identityStore = config.identityStore ?? new RuntimeAnalyticsIdentityStore();
    this.fetcher = config.fetcher ?? fetch;
    this.sdk = config.sdk ?? null;
  }

  async initialize(): Promise<void> {
    this.distinctId = await this.identityStore.get();
    if (!this.distinctId) {
      this.distinctId = createUuid();
      await this.identityStore.set(this.distinctId);
    }
    try {
      await this.sdk?.initialize();
    } catch {
      // Analytics initialization must never block the local-first product.
    }
  }

  async setConsent(enabled: boolean): Promise<void> {
    this.consent = enabled;
    if (this.sdk) {
      try {
        if (enabled) await this.sdk.optIn();
        else await this.sdk.optOut();
      } catch {
        // Consent state remains local even if the provider is unavailable.
      }
    }
  }

  async identifyAccount(accountSubject: string): Promise<void> {
    this.accountSubject = accountSubject;
    try {
      await this.sdk?.identify(accountSubject);
    } catch {
      // Account linking is best effort and never carries financial data.
    }
  }

  async capture(event: AnalyticsEvent, properties: AnalyticsProperties = {}): Promise<void> {
    if (!this.consent || !this.config.apiKey || !this.distinctId || !ANALYTICS_EVENTS.includes(event)) return;
    const safeProperties = Object.fromEntries(ALLOWED_PROPERTIES.flatMap((key) => properties[key] === undefined ? [] : [[key, properties[key]]]));
    try {
      if (this.sdk) {
        try {
          await this.sdk.capture(event, { platform: this.config.platform, appVersion: this.config.appVersion, ...safeProperties });
        } catch {
          // Analytics must never affect local financial workflows.
        }
        return;
      }
      await this.fetcher(`${this.host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.config.apiKey,
          event,
          distinct_id: this.accountSubject ?? this.distinctId,
          properties: { platform: this.config.platform, appVersion: this.config.appVersion, ...safeProperties, $process_person_profile: false, $replay_sample_rate: 0 }
        })
      });
    } catch {
      // Analytics must never affect local financial workflows or produce sensitive logs.
    }
  }

  static replayMaskingSelectors(): readonly string[] {
    return REPLAY_MASKING_SELECTORS;
  }

  getProviderClient(): unknown {
    return this.sdk?.providerClient;
  }
}

export function createPostHogAnalyticsClient(): PostHogAnalyticsClient {
  return new PostHogAnalyticsClient({
    apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    platform: process.env.EXPO_PUBLIC_PLATFORM === "ios" || process.env.EXPO_PUBLIC_PLATFORM === "android" ? process.env.EXPO_PUBLIC_PLATFORM : "web",
    appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? "1.0.0",
    sdk: createPostHogSdk({ apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY, host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com", appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? "1.0.0" })
  });
}
