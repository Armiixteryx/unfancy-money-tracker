import { getLocales } from "expo-localization";
import { localeWithRegion } from "./locale";
import { regionForLocale } from "./region";
export function devicePreferences() {
  const locales = getLocales();
  const first = locales[0];
  const locale = localeWithRegion(first?.languageTag ?? "en-US", first?.regionCode);
  return { tags: locales.map(value => value.languageTag), region: regionForLocale(locale, first?.decimalSeparator, first?.digitGroupingSeparator) };
}
