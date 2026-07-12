import Decimal from "decimal.js";
import { z } from "zod";

import { isCurrencyCode, type CurrencyCode } from "../../domain/currency";
import { ExchangeRateError, type ExchangeRateProvider, type RateCache, type RateRecord } from "./types";

const responseSchema = z.array(z.object({ date: z.string(), base: z.string(), quote: z.string(), rate: z.number().or(z.string()) }));
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

export class FrankfurterExchangeRateAdapter implements ExchangeRateProvider {
  constructor(
    private readonly cache: RateCache,
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = "https://api.frankfurter.dev/v2"
  ) {}

  async getLatestRate(base: CurrencyCode, quote: CurrencyCode): Promise<RateRecord> {
    if (base === quote) return sameCurrencyRate(base);
    const key = `latest:${base}:${quote}`;
    const cached = await this.cache.get(key);
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < MAX_CACHE_AGE_MS) return { ...cached, status: "fresh" };
    try {
      const record = await this.fetchRate(base, quote);
      await this.cache.set(key, record);
      return record;
    } catch (error) {
      if (cached) return { ...cached, status: "stale" };
      throw error;
    }
  }

  async getHistoricalRate(base: CurrencyCode, quote: CurrencyCode, date: string): Promise<RateRecord> {
    if (base === quote) return sameCurrencyRate(base, date);
    const exactKey = `historical:${base}:${quote}:${date}`;
    const cached = await this.cache.get(exactKey);
    if (cached) return cached;
    let candidate = date;
    while (candidate >= "1999-01-04") {
      try {
        const record = await this.fetchRate(base, quote, candidate);
        await this.cache.set(exactKey, record);
        await this.cache.set(`historical:${base}:${quote}:${record.effectiveDate}`, record);
        return record;
      } catch (error) {
        if (!(error instanceof ExchangeRateError) || error.code !== "unavailable") throw error;
        candidate = previousDate(candidate);
      }
    }
    throw new ExchangeRateError("unavailable", "No historical exchange rate is available for this date.");
  }

  private async fetchRate(base: CurrencyCode, quote: CurrencyCode, date?: string): Promise<RateRecord> {
    if (!isCurrencyCode(base) || !isCurrencyCode(quote)) throw new ExchangeRateError("unsupported_currency", "Currency is not supported.");
    const url = new URL(`${this.baseUrl}/rates`);
    url.searchParams.set("base", base);
    url.searchParams.set("quotes", quote);
    url.searchParams.set("providers", "ECB");
    if (date) url.searchParams.set("date", date);
    let response: Response;
    try {
      response = await this.fetcher(url);
    } catch {
      throw new ExchangeRateError("unavailable", "Exchange rates are temporarily unavailable.");
    }
    if (!response.ok) throw new ExchangeRateError("unavailable", "Exchange rates are temporarily unavailable.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ExchangeRateError("invalid_response", "Exchange rates returned an invalid response.");
    }
    const parsed = responseSchema.safeParse(payload);
    const row = parsed.success ? parsed.data.find((candidate) => candidate.quote === quote && candidate.base === base) : undefined;
    if (!row) throw new ExchangeRateError("unavailable", "No exchange rate is available for this date.");
    const rate = new Decimal(String(row.rate));
    if (!rate.isFinite() || rate.isNegative() || rate.isZero()) throw new ExchangeRateError("invalid_response", "Exchange rates returned an invalid response.");
    return { base, quote, rate: rate.toSignificantDigits(24).toString(), effectiveDate: row.date, fetchedAt: new Date().toISOString(), provider: "frankfurter-ecb", status: "fresh" };
  }
}

function sameCurrencyRate(currency: CurrencyCode, date = new Date().toISOString().slice(0, 10)): RateRecord {
  return { base: currency, quote: currency, rate: "1", effectiveDate: date, fetchedAt: new Date().toISOString(), provider: "same-currency", status: "fresh" };
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
