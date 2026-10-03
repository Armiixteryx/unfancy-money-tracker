import { regionForLocale } from "./region";
export function devicePreferences() {
  const tags = typeof navigator !== "undefined" ? [...navigator.languages] : ["en-US"];
  return { tags, region: regionForLocale(tags[0] ?? "en-US") };
}
