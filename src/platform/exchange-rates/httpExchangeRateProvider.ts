import type { CurrencyCode } from "../../domain/currency";
import { ExchangeRateError, rateRecordSchema, type ExchangeRateProvider, type RateRecord } from "./types";

export class HttpExchangeRateProvider implements ExchangeRateProvider {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}

  getLatestRate(base: CurrencyCode, quote: CurrencyCode): Promise<RateRecord> {
    return this.fetchRate(base, quote);
  }

  getHistoricalRate(base: CurrencyCode, quote: CurrencyCode, date: string): Promise<RateRecord> {
    return this.fetchRate(base, quote, date);
  }

  private async fetchRate(base: CurrencyCode, quote: CurrencyCode, date?: string): Promise<RateRecord> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("base", base);
    url.searchParams.set("quote", quote);
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
    const parsed = rateRecordSchema.safeParse(payload);
    if (!parsed.success || parsed.data.base !== base || parsed.data.quote !== quote) throw new ExchangeRateError("invalid_response", "Exchange rates returned an invalid response.");
    return { ...parsed.data, base, quote };
  }
}
