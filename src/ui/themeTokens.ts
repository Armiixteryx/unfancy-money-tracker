import type { Theme } from "../domain/types";

export type ResolvedTheme = "light" | "dark";

export type ThemeColors = {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  muted: string;
  border: string;
  divider: string;
  primary: string;
  onPrimary: string;
  positive: string;
  negative: string;
  accent: string;
  placeholder: string;
  track: string;
  positiveSubtle: string;
  negativeSubtle: string;
  infoSubtle: string;
  warning: string;
  warningSubtle: string;
  pro: string;
  proSubtle: string;
};

export const lightColors: ThemeColors = {
  canvas: "#F7F5F0", surface: "#FFFFFF", surfaceRaised: "#F8FAFC", text: "#102A43", muted: "#526D82",
  border: "#D9E2EC", divider: "#EEF2F5", primary: "#102A43", onPrimary: "#FFFFFF", positive: "#0F7A3A",
  negative: "#C93636", accent: "#2F80ED", placeholder: "#6F8498", track: "#EDF1F5", positiveSubtle: "#E9F7EF",
  negativeSubtle: "#FFF2F0", infoSubtle: "#EAF0F8", warning: "#9A6700", warningSubtle: "#FFF7E6",
  pro: "#6D4AFF", proSubtle: "#F1EDFF"
};

export const darkColors: ThemeColors = {
  canvas: "#0B1220", surface: "#111C2E", surfaceRaised: "#172944", text: "#F4F1EA", muted: "#A8B4C3",
  border: "#2A3A50", divider: "#213047", primary: "#69A7FF", onPrimary: "#08111F", positive: "#4BC87A",
  negative: "#FF7B72", accent: "#69A7FF", placeholder: "#7F91A6", track: "#243247", positiveSubtle: "#142C24",
  negativeSubtle: "#321D22", infoSubtle: "#14263D", warning: "#F0C36A", warningSubtle: "#332817",
  pro: "#B9A2FF", proSubtle: "#251F3F"
};

export function resolveTheme(preference: Theme, systemScheme: "light" | "dark" | null | undefined): ResolvedTheme {
  if (preference === "system") return systemScheme === "dark" ? "dark" : "light";
  return preference;
}
