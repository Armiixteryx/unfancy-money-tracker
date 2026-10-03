import { afterEach, expect, it, vi } from "vitest";
import i18next from "i18next";
import { en, es } from "./catalogs";
import { formatMoney, regionForLocale } from "./region";

const originalLocale = Intl.Locale;
const originalPluralRules = Intl.PluralRules;
const originalFormatToParts = Intl.NumberFormat.prototype.formatToParts;
afterEach(() => {
  Object.defineProperty(Intl, "Locale", { configurable: true, writable: true, value: originalLocale });
  Object.defineProperty(Intl, "PluralRules", { configurable: true, writable: true, value: originalPluralRules });
  Object.defineProperty(Intl.NumberFormat.prototype, "formatToParts", { configurable: true, writable: true, value: originalFormatToParts });
  vi.resetModules();
  vi.restoreAllMocks();
});

it("initializes and formats regions without iOS formatToParts", async () => {
  Object.defineProperty(Intl.NumberFormat.prototype, "formatToParts", { configurable: true, writable: true, value: undefined });
  vi.resetModules();
  const region = await import("./region");
  expect(region.regionForLocale("es-VE").decimalSeparator).toBe(",");
  expect(region.formatMoney({ amount: "12345678901234567890.12", currency: "USD" }, region.regionForLocale("es-VE"))).toBe("12.345.678.901.234.567.890,12 USD");
  expect(region.formatMoney({ amount: "1234567.12", currency: "USD" }, region.regionForLocale("en-IN"))).toBe("12,34,567.12 USD");
  expect(region.formatMoney({ amount: "-0.12", currency: "USD" }, region.regionForLocale("en-US"))).toBe("-0.12 USD");
  expect(region.formatNumber(1234.5, {}, region.regionForLocale("ar-EG"))).toBe("١٬٢٣٤٫٥");
});

it("formats exact amounts when native NumberFormat rejects BigInt", () => {
  const original = Intl.NumberFormat.prototype.formatToParts;
  vi.spyOn(Intl.NumberFormat.prototype, "formatToParts").mockImplementation(function (this: Intl.NumberFormat, value) {
    if (typeof value === "bigint") throw new TypeError("Cannot convert BigInt to number");
    return original.call(this, value);
  });
  expect(formatMoney({ amount: "123456789012345678901234567890.12", currency: "USD" }, regionForLocale("es-VE"))).toBe("123.456.789.012.345.678.901.234.567.890,12 USD");
});

it("boots bundled plural rules with Hermes-style missing Intl APIs", async () => {
  Object.defineProperty(Intl, "Locale", { configurable: true, writable: true, value: undefined });
  Object.defineProperty(Intl, "PluralRules", { configurable: true, writable: true, value: undefined });
  await import("./pluralRules.native");
  expect(new Intl.PluralRules("en").select(1)).toBe("one");
  expect(new Intl.PluralRules("es").select(2)).toBe("other");
  const instance = i18next.createInstance();
  await instance.init({ resources: { en: { translation: en }, es: { translation: es } }, lng: "es", fallbackLng: "en", initAsync: false });
  expect(instance.t($ => $.reports.activity, { count: 2, month: "octubre", currencies: "USD" })).toContain("transacciones");
});
