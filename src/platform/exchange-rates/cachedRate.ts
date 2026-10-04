import type { CurrencyCode } from "../../domain/currency";
import { rateRecordSchema, type RateCache, type RateRecord } from "./types";

export const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

export function rateCacheKey(base: CurrencyCode, quote: CurrencyCode, date?: string): string {
  return date ? `historical:${base}:${quote}:${date}` : `latest:${base}:${quote}`;
}

export function validRateForRequest(value: unknown, base: CurrencyCode, quote: CurrencyCode, date?: string): RateRecord | null {
  const parsed = rateRecordSchema.safeParse(value);
  if (!parsed.success) return null;
  const record = parsed.data;
  if (record.base !== base || record.quote !== quote || (date && record.effectiveDate > date) || Date.parse(record.fetchedAt) > Date.now()) return null;
  if (base === quote ? record.provider !== "same-currency" || record.rate !== "1" : record.provider !== "frankfurter-blended") return null;
  return record;
}

export async function cachedRate(cache: RateCache, base: CurrencyCode, quote: CurrencyCode, date: string | undefined, refresh: () => Promise<RateRecord>): Promise<RateRecord> {
  const key = rateCacheKey(base, quote, date);
  // Persistence is an optimization: outages must not hide successful upstream results.
  const cached = validRateForRequest(await cache.get(key).catch(() => null), base, quote, date);
  if (cached?.status === "fresh" && Date.now() - Date.parse(cached.fetchedAt) < MAX_CACHE_AGE_MS) return cached;
  let record: RateRecord;
  try {
    record = await refresh();
  } catch (error) {
    if (cached) return { ...cached, status: "stale" };
    throw error;
  }
  await cache.set(key, record).catch(() => undefined);
  return record;
}
