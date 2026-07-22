import { describe, expect, it } from "vitest";

import { HttpExchangeRateProvider } from "./httpExchangeRateProvider";

describe("HTTP exchange-rate boundary", () => {
  it("sends only currency and optional date parameters and validates the response", async () => {
    let requestedSearch = "";
    const fetcher = async function (this: unknown, input: RequestInfo | URL) {
      expect(this).toBeUndefined();
      requestedSearch = new URL(input.toString()).search;
      return new Response(JSON.stringify({ base: "USD", quote: "EUR", rate: "0.91", effectiveDate: "2026-07-10", fetchedAt: "2026-07-12T00:00:00.000Z", provider: "frankfurter-ecb", status: "fresh" }), { status: 200 });
    };
    const provider = new HttpExchangeRateProvider("https://api.example.test/rates", fetcher);
    const result = await provider.getHistoricalRate("USD", "EUR", "2026-07-10");
    expect(requestedSearch).toContain("base=USD");
    expect(requestedSearch).toContain("quote=EUR");
    expect(requestedSearch).toContain("date=2026-07-10");
    expect(result.rate).toBe("0.91");
  });

  it("distinguishes a missing ECB reference rate from an unreachable provider", async () => {
    const provider = new HttpExchangeRateProvider("https://api.example.test/rates", async () => new Response(JSON.stringify({ error: "no_rate_available" }), { status: 404 }));

    await expect(provider.getLatestRate("USD", "VES")).rejects.toMatchObject({ code: "no_rate_available" });
  });
});
