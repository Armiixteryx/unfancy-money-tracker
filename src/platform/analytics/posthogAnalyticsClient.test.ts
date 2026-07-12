import { describe, expect, it } from "vitest";

import { PostHogAnalyticsClient, type AnalyticsIdentityStore } from "./index";

class TestIdentityStore implements AnalyticsIdentityStore {
  value: string | null = "anonymous-test-id";
  async get(): Promise<string | null> { return this.value; }
  async set(value: string): Promise<void> { this.value = value; }
}

describe("privacy analytics", () => {
  it("does not capture before consent and only sends allowlisted properties", async () => {
    const requests: RequestInit[] = [];
    const client = new PostHogAnalyticsClient({ apiKey: "test-key", platform: "web", appVersion: "test", identityStore: new TestIdentityStore(), fetcher: async (_input, init) => { requests.push(init ?? {}); return new Response(null, { status: 200 }); } });
    await client.initialize();
    await client.capture("dashboard_viewed", { surface: "dashboard" });
    expect(requests).toHaveLength(0);
    await client.setConsent(true);
    await client.capture("dashboard_viewed", { surface: "dashboard", actionResult: "success", errorCode: "safe", syncStatus: "synced", appVersion: "override" });
    expect(requests).toHaveLength(1);
    const body = JSON.parse(String(requests[0].body)) as { properties: Record<string, unknown> };
    expect(body.properties.surface).toBe("dashboard");
    expect(body.properties.platform).toBe("web");
    expect(body.properties.appVersion).toBe("override");
    expect(body.properties.amount).toBeUndefined();
  });

  it("stops future capture after opting out", async () => {
    let calls = 0;
    const client = new PostHogAnalyticsClient({ apiKey: "test-key", platform: "web", appVersion: "test", identityStore: new TestIdentityStore(), fetcher: async () => { calls += 1; return new Response(null, { status: 200 }); } });
    await client.initialize();
    await client.setConsent(true);
    await client.setConsent(false);
    await client.capture("report_viewed", { surface: "reports" });
    expect(calls).toBe(0);
  });
});
