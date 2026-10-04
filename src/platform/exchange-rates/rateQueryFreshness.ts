import type { Query } from "@tanstack/react-query";
import { MAX_CACHE_AGE_MS } from "./cachedRate";
import type { RateRecord } from "./types";

export function rateQueryFreshness(query: Query<RateRecord>): number {
  const record = query.state.data;
  if (!record || record.status === "stale") return 0;
  // TanStack measures age from dataUpdatedAt, which may be a later cache read.
  return Math.max(0, Date.parse(record.fetchedAt) + MAX_CACHE_AGE_MS - query.state.dataUpdatedAt);
}
