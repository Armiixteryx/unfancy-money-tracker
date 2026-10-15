import type { CurrencyCode } from "../../domain/currency";
import { ExchangeRateError, rateRecordSchema, type ExchangeRateProvider, type RateRecord } from "../../platform/exchange-rates/types";

function rate(base: CurrencyCode, quote: CurrencyCode, date = new Date().toISOString().slice(0, 10)): Promise<RateRecord> {
  if (base !== quote) return Promise.reject(new ExchangeRateError("no_rate_available", "Currency conversion is unavailable in the offline demo."));
  return Promise.resolve(rateRecordSchema.parse({ base, quote, rate: "1", effectiveDate: date, fetchedAt: new Date().toISOString(), provider: "same-currency", status: "fresh" }));
}

export const demoExchangeRateProvider: ExchangeRateProvider = {
  getLatestRate: (base, quote) => rate(base, quote),
  getHistoricalRate: (base, quote, date) => rate(base, quote, date),
};
