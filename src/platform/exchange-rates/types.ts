import Decimal from "decimal.js";
import { isCurrencyCode, type CurrencyCode } from "../../domain/currency";
import { z } from "zod";

export type RateStatus = "fresh" | "stale";

export type RateRecord = {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: string;
  effectiveDate: string;
  fetchedAt: string;
  provider: "frankfurter-blended" | "same-currency";
  status: RateStatus;
};

export const rateRecordSchema = z.object({
  base: z.custom<CurrencyCode>(value => typeof value === "string" && isCurrencyCode(value)),
  quote: z.custom<CurrencyCode>(value => typeof value === "string" && isCurrencyCode(value)),
  rate: z.string().regex(/^[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/i).refine(value => {
    try { const rate = new Decimal(value); return rate.isFinite() && rate.isPositive() && !rate.isZero(); } catch { return false; }
  }),
  effectiveDate: z.string().date(),
  fetchedAt: z.string().datetime(),
  provider: z.enum(["frankfurter-blended", "same-currency"]),
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
