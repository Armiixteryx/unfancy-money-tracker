import "./pluralRules";
import type { Message } from "./notices";
import { formatMonth, formatNumber } from "./region";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import type { Category, LanguagePreference } from "../domain/types";
import { en, es } from "./catalogs";

export function resolveLanguage(preference: LanguagePreference, tags: readonly string[]): "en" | "es" {
  if (preference !== "system") return preference;
  for (const tag of tags) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === "en" || language === "es") return language;
  }
  return "en";
}

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: "en", fallbackLng: "en", supportedLngs: ["en", "es"],
  interpolation: { escapeValue: false }, initAsync: false
});

i18n.services.formatter?.add("number", (value: unknown) => typeof value === "number" || typeof value === "bigint" ? formatNumber(value) : String(value));

export function categoryLabel(category: Category | undefined): string {
  if (!category) return i18n.t($ => $.categories.uncategorized);
  const key = category.defaultCategoryKey;
  return key ? i18n.t($ => $.categories[key]) : category.name;
}

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
    enableSelector: true;
  }
}

// Resolve codes and previously visible messages at render time, without exposing unknown errors.
export function translateMessage(message: Message, generic = false): string {
  if (typeof message !== "string") {
    if (message.code === "baseCurrencySaved") return i18n.t($ => $.notices.baseCurrencySaved, { currency: message.currency });
    return message.code === "categoryAdded" ? i18n.t($ => $.notices.categoryAdded, { name: message.name }) : i18n.t($ => $.notices.budgetsCopied, { count: message.count, month: formatMonth(message.month), skipped: message.skipped });
  }
  for (const key of ["languageSaved", "previewInterest"] as const) if (message === en.notices[key] || message === es.notices[key]) return i18n.t($ => $.notices[key]);
  const failureKey = Object.keys(en.failures).find(key => key === message || en.failures[key as keyof typeof en.failures] === message || es.failures[key as keyof typeof es.failures] === message) as keyof typeof en.failures | undefined;
  if (failureKey) return i18n.t($ => $.failures[failureKey]);
  const uiKey = Object.keys(en.ui).find(key => en.ui[key as keyof typeof en.ui] === message || es.ui[key as keyof typeof es.ui] === message) as keyof typeof en.ui | undefined;
  if (uiKey) return i18n.t($ => $.ui[uiKey]);
  if (message.startsWith("invalid_amount_draft:")) return i18n.t($ => $.errors.amount, { example: message.slice("invalid_amount_draft:".length) });
  const token = /^amount_precision:([A-Z]{3}):(\d+)$/.exec(message);
  if (token) return i18n.t($ => $.errors.precision, { currency: token[1]!, count: Number(token[2]) });
  const precision = /^([A-Z]{3}) supports at most (\d+) decimal places$/.exec(message);
  if (precision) return i18n.t($ => $.errors.precision, { currency: precision[1]!, count: Number(precision[2]) });
  return generic ? i18n.t($ => $.errors.generic) : message;
}
