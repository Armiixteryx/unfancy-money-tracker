import { createContext, createElement, useContext, useEffect, useMemo, type PropsWithChildren } from "react";
import { Platform, useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";

import type { Theme } from "../domain/types";
import { useDatasetStore } from "../features/sync/store/useDatasetStore";
import { darkColors, lightColors, resolveTheme, type ResolvedTheme, type ThemeColors } from "./themeTokens";

export { darkColors, lightColors, resolveTheme } from "./themeTokens";
export type { ResolvedTheme, ThemeColors } from "./themeTokens";

type AppTheme = {
  preference: Theme;
  resolvedTheme: ResolvedTheme;
  colors: ThemeColors;
};

const ThemeContext = createContext<AppTheme>({ preference: "system", resolvedTheme: "light", colors: lightColors });

export function AppThemeProvider({ children }: PropsWithChildren) {
  const preference = useDatasetStore((state) => state.dataset?.preferences.theme ?? "system");
  const systemScheme = useColorScheme();
  const resolvedTheme = resolveTheme(preference, systemScheme);
  const colors = resolvedTheme === "dark" ? darkColors : lightColors;
  const value = useMemo(() => ({ preference, resolvedTheme, colors }), [colors, preference, resolvedTheme]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => undefined);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.style.colorScheme = resolvedTheme;
      document.documentElement.style.backgroundColor = colors.canvas;
      document.body.style.backgroundColor = colors.canvas;
    }
  }, [colors, resolvedTheme]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}

export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useAppTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
