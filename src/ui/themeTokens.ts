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
  canvas: "#EFECEA", surface: "#FFFFFF", surfaceRaised: "#F7F5F2", text: "#102A43", muted: "#59666C",
  border: "#DCD9D6", divider: "#EEECE8", primary: "#102A43", onPrimary: "#FFFFFF", positive: "#0F7A3A",
  negative: "#C03232", accent: "#0F7A3A", placeholder: "#5B666D", track: "#EEECE8", positiveSubtle: "#EDF6EF",
  negativeSubtle: "#FFF2F0", infoSubtle: "#F1F3F3", warning: "#886000", warningSubtle: "#FFF7E6",
  pro: "#102A43", proSubtle: "#F1F3F3"
};

export const darkColors: ThemeColors = {
  canvas: "#0B1220", surface: "#111C2E", surfaceRaised: "#172944", text: "#F4F1EA", muted: "#A8B4C3",
  border: "#2A3A50", divider: "#213047", primary: "#4BC87A", onPrimary: "#08111F", positive: "#4BC87A",
  negative: "#FF7B72", accent: "#4BC87A", placeholder: "#A8B4C3", track: "#243247", positiveSubtle: "#142C24",
  negativeSubtle: "#321D22", infoSubtle: "#14263D", warning: "#F0C36A", warningSubtle: "#332817",
  pro: "#F4F1EA", proSubtle: "#172944"
};

export function resolveTheme(preference: Theme, systemScheme: "light" | "dark" | null | undefined): ResolvedTheme {
  if (preference === "system") return systemScheme === "dark" ? "dark" : "light";
  return preference;
}
