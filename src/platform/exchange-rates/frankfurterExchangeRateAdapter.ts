import { z } from "zod";

import { isCurrencyCode, type CurrencyCode } from "../../domain/currency";
import { cachedRate } from "./cachedRate";
import { rateRecordSchema, ExchangeRateError, type ExchangeRateProvider, type RateCache, type RateRecord } from "./types";

const responseSchema = z.array(z.object({ date: z.string().date(), base: z.string(), quote: z.string(), rate: z.number().positive().finite() }));
const MAX_HISTORICAL_LOOKBACK_DAYS = 10;

export class FrankfurterExchangeRateAdapter implements ExchangeRateProvider {
  constructor(
    private readonly cache: RateCache,
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = "https://api.frankfurter.dev/v2"
  ) {}

  async getLatestRate(base: CurrencyCode, quote: CurrencyCode): Promise<RateRecord> {
    if (base === quote) return sameCurrencyRate(base);
    return cachedRate(this.cache, base, quote, undefined, () => this.fetchRate(base, quote));
  }

  async getHistoricalRate(base: CurrencyCode, quote: CurrencyCode, date: string): Promise<RateRecord> {
    if (!z.string().date().safeParse(date).success) throw new ExchangeRateError("invalid_response", "Invalid rate date.");
    if (base === quote) return sameCurrencyRate(base, date);
    return cachedRate(this.cache, base, quote, date, async () => {
      let candidate = date;
      for (let lookbackDays = 0; lookbackDays <= MAX_HISTORICAL_LOOKBACK_DAYS && candidate >= "1948-01-01"; lookbackDays += 1) {
        try {
          return await this.fetchRate(base, quote, candidate);
        } catch (error) {
          if (!(error instanceof ExchangeRateError) || error.code !== "no_rate_available") throw error;
          candidate = previousDate(candidate);
        }
      }
      throw new ExchangeRateError("no_rate_available", "No exchange rate is available for this currency and date.");
    });
  }

  private async fetchRate(base: CurrencyCode, quote: CurrencyCode, date?: string): Promise<RateRecord> {
    if (!isCurrencyCode(base) || !isCurrencyCode(quote)) throw new ExchangeRateError("unsupported_currency", "Currency is not supported.");
    const url = new URL(`${this.baseUrl}/rates`);
    url.searchParams.set("base", base);
    url.searchParams.set("quotes", quote);
    if (date) url.searchParams.set("date", date);
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: AbortSignal.timeout(8000) });
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
    if (!parsed.success) throw new ExchangeRateError("invalid_response", "Exchange rates returned an invalid response.");
    const row = parsed.data.find(candidate => candidate.quote === quote && candidate.base === base);
    if (!row) throw new ExchangeRateError("no_rate_available", "No exchange rate is available for this currency and date.");
    const record = rateRecordSchema.safeParse({ base, quote, rate: String(row.rate), effectiveDate: row.date, fetchedAt: new Date().toISOString(), provider: "frankfurter-blended", status: "fresh" });
    if (!record.success || (date && record.data.effectiveDate > date)) throw new ExchangeRateError("invalid_response", "Exchange rates returned an invalid response.");
    return record.data;
  }
}

function sameCurrencyRate(currency: CurrencyCode, date = new Date().toISOString().slice(0, 10)): RateRecord {
  if (!isCurrencyCode(currency)) throw new ExchangeRateError("unsupported_currency", "Currency is not supported.");
  return { base: currency, quote: currency, rate: "1", effectiveDate: date, fetchedAt: new Date().toISOString(), provider: "same-currency", status: "fresh" };
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
