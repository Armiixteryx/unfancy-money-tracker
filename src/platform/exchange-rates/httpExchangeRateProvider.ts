import { isCurrencyCode, type CurrencyCode } from "../../domain/currency";
import { z } from "zod";
import { cachedRate, validRateForRequest } from "./cachedRate";
import { MemoryRateCache } from "./memoryRateCache";
import { type RateCache, ExchangeRateError, rateRecordSchema, type ExchangeRateProvider, type RateRecord } from "./types";

const errorResponseSchema = z.object({ error: z.literal("no_rate_available") });

export class HttpExchangeRateProvider implements ExchangeRateProvider {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch, private readonly cache: RateCache = new MemoryRateCache()) {}

  getLatestRate(base: CurrencyCode, quote: CurrencyCode): Promise<RateRecord> {
    if (base === quote) return Promise.resolve(sameCurrencyRate(base));
    return cachedRate(this.cache, base, quote, undefined, () => this.fetchRate(base, quote));
  }

  getHistoricalRate(base: CurrencyCode, quote: CurrencyCode, date: string): Promise<RateRecord> {
    if (base === quote) return Promise.resolve(sameCurrencyRate(base, date));
    return cachedRate(this.cache, base, quote, date, () => this.fetchRate(base, quote, date));
  }

  private async fetchRate(base: CurrencyCode, quote: CurrencyCode, date?: string): Promise<RateRecord> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("base", base);
    url.searchParams.set("quote", quote);
    if (date) url.searchParams.set("date", date);
    let response: Response;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 15000);
    try {
      const fetcher = this.fetcher;
      response = await fetcher(url, { signal: controller.signal });
    } catch {
      throw new ExchangeRateError("unavailable", "Exchange rates are temporarily unavailable.");
    } finally {
      clearTimeout(deadline);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined);
      if (response.status === 404 && errorResponseSchema.safeParse(payload).success) {
        throw new ExchangeRateError("no_rate_available", "No exchange rate is available for this currency and date.");
      }
      throw new ExchangeRateError("unavailable", "Exchange rates are temporarily unavailable.");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ExchangeRateError("invalid_response", "Exchange rates returned an invalid response.");
    }
    const parsed = rateRecordSchema.safeParse(payload);
    if (!parsed.success || !validRateForRequest(parsed.data, base, quote, date)) throw new ExchangeRateError("invalid_response", "Exchange rates returned an invalid response.");
    return { ...parsed.data, base, quote };
  }
}

function sameCurrencyRate(currency: CurrencyCode, date = new Date().toISOString().slice(0, 10)): RateRecord {
  if (!isCurrencyCode(currency) || !z.string().date().safeParse(date).success) throw new ExchangeRateError("invalid_response", "Invalid rate request.");
  return { base: currency, quote: currency, rate: "1", effectiveDate: date, fetchedAt: new Date().toISOString(), provider: "same-currency", status: "fresh" };
}
