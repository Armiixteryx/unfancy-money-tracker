import type { CurrencyCode } from "../../domain/currency";
import { z } from "zod";

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

export const rateRecordSchema = z.object({
  base: z.string(),
  quote: z.string(),
  rate: z.string().min(1),
  effectiveDate: z.string().date(),
  fetchedAt: z.string().datetime(),
  provider: z.enum(["frankfurter-ecb", "same-currency"]),
  status: z.enum(["fresh", "stale"])
});

export class ExchangeRateError extends Error {
  constructor(readonly code: "unavailable" | "no_rate_available" | "invalid_response" | "unsupported_currency", message: string) {
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
