import { createContext } from "react";
import type { TextStyle } from "react-native";

export const TextColorContext = createContext("#102A43");

export const FontsReadyContext = createContext(false);

export const typography = {
  heading: { fontFamily: "Fraunces_400Regular", fontWeight: "400", fontSize: 24, lineHeight: 30, letterSpacing: -0.7 },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: -0.16 },
  label: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 20 },
  amount: { fontVariant: ["tabular-nums"], fontWeight: "500", letterSpacing: -0.5 },
} satisfies Record<string, TextStyle>;

export const layout = {
  railBreakpoint: 1024,
  workspaceBreakpoint: 1200,
  railWidth: 232,
  maxContentWidth: 1200,
  mobilePadding: 16,
  desktopPadding: 24,
  gap: 16,
  cardRadius: 12,
  inputRadius: 8,
  pillRadius: 9999,
  touchTarget: 48,
} as const;

export function isWebRail(platform: string, width: number): boolean {
  return platform === "web" && width >= layout.railBreakpoint;
}

export function isWebWorkspace(platform: string, width: number): boolean {
  return platform === "web" && width >= layout.workspaceBreakpoint;
}
