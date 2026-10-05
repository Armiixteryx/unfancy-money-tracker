import { afterEach, describe, expect, it, vi } from "vitest";
import { FrankfurterExchangeRateAdapter } from "./frankfurterExchangeRateAdapter";
import { MemoryRateCache } from "./memoryRateCache";
import type { RateCache, RateRecord } from "./types";

const now = new Date("2026-10-04T12:00:00Z");
const row = { date: "2026-10-02", base: "USD", quote: "EUR", rate: 0.91 };
afterEach(() => vi.useRealTimers());

describe("blended rate cache policy", () => {
  it.each([undefined, "2026-10-04"])("shares %s requests and refreshes at exactly 24 hours without extending freshness on reads", async date => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const cache = new MemoryRateCache();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([row])));
    const first = new FrankfurterExchangeRateAdapter(cache, fetcher);
    const second = new FrankfurterExchangeRateAdapter(cache, fetcher);
    const get = (provider: FrankfurterExchangeRateAdapter) => date ? provider.getHistoricalRate("USD", "EUR", date) : provider.getLatestRate("USD", "EUR");
    const original = await get(first);
    vi.setSystemTime(now.getTime() + 86_400_000 - 1);
    expect(await get(second)).toEqual(original);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now.getTime() + 86_400_000);
    const refreshed = await get(second);
    expect(refreshed.fetchedAt).not.toBe(original.fetchedAt);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.has("providers")).toBe(false);
  });

  it.each([undefined, "2026-10-04"])("retains the original timestamp and effective date when %s refresh fails", async date => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([row])));
    const cache = new MemoryRateCache();
    const provider = new FrankfurterExchangeRateAdapter(cache, fetcher);
    const get = () => date ? provider.getHistoricalRate("USD", "EUR", date) : provider.getLatestRate("USD", "EUR");
    const original = await get();
    vi.setSystemTime(now.getTime() + 86_400_000);
    fetcher.mockRejectedValue(new Error("synthetic offline"));
    expect(await get()).toEqual({ ...original, status: "stale" });
    expect(await cache.get(date ? `historical:USD:EUR:${date}` : "latest:USD:EUR")).toEqual(original);
  });

  it("isolates latest, requested dates, and currency pairs", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = new URL(String(input));
      return new Response(JSON.stringify([{ ...row, base: url.searchParams.get("base"), quote: url.searchParams.get("quotes"), date: url.searchParams.get("date") ?? row.date }]));
    });
    const provider = new FrankfurterExchangeRateAdapter(new MemoryRateCache(), fetcher);
    await provider.getLatestRate("USD", "EUR");
    await provider.getHistoricalRate("USD", "EUR", "2026-10-03");
    await provider.getHistoricalRate("USD", "EUR", "2026-10-04");
    await provider.getLatestRate("EUR", "USD");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("falls back to the prior published date for a weekend and caches under the requested date", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new Response(JSON.stringify(new URL(String(input)).searchParams.get("date") === "2026-10-02" ? [row] : [])));
    const provider = new FrankfurterExchangeRateAdapter(new MemoryRateCache(), fetcher);
    expect((await provider.getHistoricalRate("USD", "EUR", "2026-10-04")).effectiveDate).toBe("2026-10-02");
    await provider.getHistoricalRate("USD", "EUR", "2026-10-04");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each(["read", "write"])("does not let a cache %s failure hide valid upstream data", async failure => {
    const cache: RateCache = { get: async () => { if (failure === "read") throw new Error("cache unavailable"); return null; }, set: async () => { if (failure === "write") throw new Error("cache unavailable"); } };
    const provider = new FrankfurterExchangeRateAdapter(cache, async () => new Response(JSON.stringify([row])));
    expect((await provider.getLatestRate("USD", "EUR")).status).toBe("fresh");
  });

  it.each([{ provider: "frankfurter-ecb" }, { rate: "NaN" }, { base: "EUR" }, { fetchedAt: "2030-01-01T00:00:00Z" }, { rate: "-1" }])("treats malformed or incompatible cache data as a miss: %s", async invalid => {
    const cache: RateCache = { get: async () => ({ ...row, rate: "0.91", effectiveDate: row.date, provider: "frankfurter-blended", status: "fresh", fetchedAt: new Date().toISOString(), ...invalid }) as RateRecord, set: async () => {} };
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([row])));
    await new FrankfurterExchangeRateAdapter(cache, fetcher).getLatestRate("USD", "EUR");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([[{ ...row, rate: -1 }], [{ ...row, date: "invalid" }], { rates: { EUR: 0.91 } }])("rejects malformed upstream payloads", async payload => {
    const provider = new FrankfurterExchangeRateAdapter(new MemoryRateCache(), async () => new Response(JSON.stringify(payload)));
    await expect(provider.getLatestRate("USD", "EUR")).rejects.toMatchObject({ code: "invalid_response" });
  });
});
