import type { CurrencyCode } from "../../domain/currency";

export type RateStatus = "fresh" | "stale";

export type RateRecord = {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: string;
  effectiveDate: string;
  fetchedAt: string;
  provider: "frankfurter-ecb" | "same-currency";
  status: RateStatus;
};

export class ExchangeRateError extends Error {
  constructor(readonly code: "unavailable" | "invalid_response" | "unsupported_currency", message: string) {
    super(message);
    this.name = "ExchangeRateError";
  }
}

export interface RateCache {
  get(key: string): Promise<RateRecord | null>;
  set(key: string, record: RateRecord): Promise<void>;
}

export interface ExchangeRateProvider {
  getLatestRate(base: CurrencyCode, quote: CurrencyCode): Promise<RateRecord>;
  getHistoricalRate(base: CurrencyCode, quote: CurrencyCode, date: string): Promise<RateRecord>;
}

