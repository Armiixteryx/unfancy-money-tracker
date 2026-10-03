import { currencyPrecision } from "../domain/currency";
import type { Money } from "../domain/money";

export type Region = { locale: string; decimalSeparator: string; groupingSeparator: string };
type NumberConventions = { digits: string[]; decimal: string; group: string; primary: number; secondary: number; minimumGroupedLength: number; negativePrefix: string; negativeSuffix: string };
const conventions = new Map<string, NumberConventions>();
function numberConventions(locale: string): NumberConventions {
  const cached = conventions.get(locale);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const stripDirection = (text: string) => text.replace(/[\u061c\u200e\u200f\u2066-\u2069]/g, "");
  const digits = Array.from({ length: 10 }, (_, digit) => stripDirection(digitFormatter.format(digit)));
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const digitPattern = new RegExp(digits.map(escape).join("|"), "gu");
  // Match localized digit tokens as well as Unicode numeric digits (e.g. hanidec).
  const integerGroups = (value: number) => {
    const text = stripDirection(formatter.format(value));
    const separator = text.replace(digitPattern, "").slice(0, 1);
    return separator ? text.split(separator).map(group => [...group.matchAll(digitPattern)].length) : [[...text.matchAll(digitPattern)].length];
  };
  const sample = integerGroups(123456789012345);
  const group = stripDirection(formatter.format(123456789)).replace(digitPattern, "").slice(0, 1) || ",";
  const decimal = stripDirection(digitFormatter.format(1.1)).replace(digitPattern, "") || ".";
  const negative = formatter.format(-1);
  const onePosition = negative.indexOf(digits[1]!);
  const result = {
    digits, decimal, group, primary: sample.at(-1) ?? 3, secondary: sample.at(-2) ?? sample.at(-1) ?? 3,
    minimumGroupedLength: [1000, 10000, 100000].find(value => integerGroups(value).length > 1)?.toString().length ?? Infinity,
    negativePrefix: negative.slice(0, onePosition), negativeSuffix: negative.slice(onePosition + digits[1]!.length)
  };
  conventions.set(locale, result);
  return result;
}
let current: Region = regionForLocale("en-US");
export function regionForLocale(locale: string, decimalSeparator?: string | null, groupingSeparator?: string | null): Region {
  const profile = numberConventions(locale);
  return { locale, decimalSeparator: decimalSeparator ?? profile.decimal, groupingSeparator: groupingSeparator ?? profile.group };
}
export function getRegion(): Region { return current; }
export function setRegion(region: Region): void { current = region; }
export function amountDraft(amount: string, region = current): string { return amount.replace(".", region.decimalSeparator); }
// Derive grouping from safe samples, then localize exact strings digit by digit.
// Native Intl implementations need neither formatToParts nor BigInt support.
function formatInteger(integer: string, region: Region): string {
  const negative = integer.startsWith("-");
  const whole = integer.replace(/^-/, "");
  const profile = numberConventions(region.locale);
  const chunks: string[] = [];
  let end = whole.length;
  let size = profile.primary;
  while (end > 0) {
    const begin = Math.max(0, end - size);
    chunks.unshift(whole.slice(begin, end));
    end = begin;
    size = profile.secondary;
  }
  const text = (whole.length >= profile.minimumGroupedLength ? chunks.join(region.groupingSeparator) : whole).replace(/[0-9]/g, digit => profile.digits[Number(digit)]!);
  return negative ? profile.negativePrefix + text + profile.negativeSuffix : text;
}
export function formatMoney(money: Money, region = current): string {
  const precision = currencyPrecision(money.currency);
  const [whole = "0", fraction = ""] = money.amount.split(".");
  let text = formatInteger(whole, region);
  if (precision) {
    const digits = new Intl.NumberFormat(region.locale, { useGrouping: false });
    text += region.decimalSeparator + fraction.padEnd(precision, "0").split("").map(d => digits.format(Number(d))).join("");
  }
  return `${text} ${money.currency}`;
}
export function formatCalendarDate(date: string, region = current): string {
  return new Intl.DateTimeFormat(region.locale, { calendar: "gregory", dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
export function formatMonth(month: string, region = current): string {
  return new Intl.DateTimeFormat(region.locale, { calendar: "gregory", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}
export function formatTimestamp(timestamp: string, region = current): string {
  return new Intl.DateTimeFormat(region.locale, { calendar: "gregory", dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export function formatNumber(value: number | bigint, options: Intl.NumberFormatOptions = {}, region = current): string {
  if (typeof value === "bigint") return formatInteger(value.toString(), region);
  const profile = numberConventions(region.locale);
  return new Intl.NumberFormat(region.locale, options).format(value).split(profile.group).join("\u0000").split(profile.decimal).join(region.decimalSeparator).split("\u0000").join(region.groupingSeparator);
}
