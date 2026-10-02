import { z } from "zod";

export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "CNY",
  "BRL",
  "MXN",
  "COP",
  "CLP",
  "PEN",
  "ARS",
  "UYU",
  "VES"
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const currencyCodeSchema = z.enum(SUPPORTED_CURRENCIES);

export const selectedCurrenciesSchema = z.array(currencyCodeSchema).min(1).superRefine((currencies, context) => {
  if (new Set(currencies).size !== currencies.length) context.addIssue({ code: "custom", message: "Selected currencies must be unique" });
});

export function normalizeSelectedCurrencies(currencies: readonly CurrencyCode[]): CurrencyCode[] {
  return SUPPORTED_CURRENCIES.filter((currency) => currencies.includes(currency));
}

const CURRENCY_PRECISION: Record<CurrencyCode, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0,
  CHF: 2,
  CNY: 2,
  BRL: 2,
  MXN: 2,
  COP: 2,
  CLP: 0,
  PEN: 2,
  ARS: 2,
  UYU: 2,
  VES: 2
};

export const currencyPrecision = (currency: CurrencyCode): number => CURRENCY_PRECISION[currency];

export const isCurrencyCode = (value: string): value is CurrencyCode =>
  (SUPPORTED_CURRENCIES as readonly string[]).includes(value);

