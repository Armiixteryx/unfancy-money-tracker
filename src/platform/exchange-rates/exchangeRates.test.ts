import { describe, expect, it } from "vitest";

import { FrankfurterExchangeRateAdapter, MemoryRateCache } from "./index";

describe("Frankfurter exchange-rate adapter", () => {
  it("returns same-currency rates without a provider request", async () => {
    let calls = 0;
    const adapter = new FrankfurterExchangeRateAdapter(new MemoryRateCache(), async () => {
      calls += 1;
      return new Response();
    });
    const result = await adapter.getLatestRate("USD", "USD");
    expect(result.rate).toBe("1");
    expect(calls).toBe(0);
  });

  it("parses ECB rows and retains a cached rate when the provider is unavailable", async () => {
    const cache = new MemoryRateCache();
    let online = true;
    const adapter = new FrankfurterExchangeRateAdapter(cache, async () => {
      if (!online) throw new Error("synthetic offline");
      return new Response(JSON.stringify([{ date: "2026-07-10", base: "USD", quote: "EUR", rate: 0.9123456789 }]), { status: 200 });
    });
    const first = await adapter.getLatestRate("USD", "EUR");
    expect(first.rate).toBe("0.9123456789");
    await cache.set("latest:USD:EUR", { ...first, fetchedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    online = false;
    const stale = await adapter.getLatestRate("USD", "EUR");
    expect(stale.status).toBe("stale");
  });

  it("reports an unavailable ECB currency without retrying through decades of dates", async () => {
    let calls = 0;
    const adapter = new FrankfurterExchangeRateAdapter(new MemoryRateCache(), async () => {
      calls += 1;
      return new Response(JSON.stringify([]), { status: 200 });
    });

    await expect(adapter.getHistoricalRate("USD", "VES", "2026-07-22")).rejects.toMatchObject({ code: "no_rate_available" });
    expect(calls).toBe(11);
  });
});
