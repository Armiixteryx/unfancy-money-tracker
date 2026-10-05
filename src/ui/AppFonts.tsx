import { useFonts } from "expo-font";
import type { PropsWithChildren } from "react";
import { FontsReadyContext } from "./designTokens";

export function AppFonts({ children }: PropsWithChildren) {
  const [loaded] = useFonts({
    Fraunces_400Regular: require("../../assets/fonts/Fraunces_400Regular.ttf"),
    Inter_400Regular: require("../../assets/fonts/Inter_400Regular.ttf"),
    Inter_500Medium: require("../../assets/fonts/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("../../assets/fonts/Inter_600SemiBold.ttf"),
  });

  // Font failure never blocks hydration, recovery, navigation, or manual entry.
  return <FontsReadyContext.Provider value={loaded}>{children}</FontsReadyContext.Provider>;
}
