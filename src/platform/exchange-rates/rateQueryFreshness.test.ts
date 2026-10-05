import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { rateQueryFreshness } from "./rateQueryFreshness";
import type { RateRecord } from "./types";

afterEach(() => vi.useRealTimers());
it("expires reused query data at the original 24-hour boundary, without premature expiry or extending it", () => {
  vi.useFakeTimers();
  const fetched = Date.parse("2026-10-04T00:00:00Z");
  vi.setSystemTime(fetched + 23 * 3_600_000);
  const client = new QueryClient();
  const record: RateRecord = { base: "USD", quote: "EUR", rate: "0.91", effectiveDate: "2026-10-02", fetchedAt: new Date(fetched).toISOString(), provider: "frankfurter-blended", status: "fresh" };
  const options = { queryKey: ["synthetic-rate"], queryFn: async () => record, initialData: record, staleTime: rateQueryFreshness };
  const observer = new QueryObserver(client, options);
  expect(observer.getCurrentResult().isStale).toBe(false);
  vi.setSystemTime(fetched + 86_400_000 - 1);
  observer.setOptions(options);
  expect(observer.getCurrentResult().isStale).toBe(false);
  vi.setSystemTime(fetched + 86_400_000);
  observer.setOptions(options);
  expect(observer.getCurrentResult().isStale).toBe(true);
  client.clear();
});
