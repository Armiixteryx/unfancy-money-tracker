import type { ThemeColors } from "./themeTokens";

/** Selection is independent of the filled primary-action color in either theme. */
export function selectionStyles(colors: ThemeColors) {
  return {
    selectedControl: { backgroundColor: colors.positiveSubtle, borderColor: colors.accent },
    selectedText: { color: colors.accent },
  };
}
