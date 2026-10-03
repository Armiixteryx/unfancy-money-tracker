import { useEffect, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { I18nextProvider } from "react-i18next";
import { useLocalDatasetStore } from "../features/local-data/store/useLocalDatasetStore";
import { devicePreferences } from "./device";
import { i18n, resolveLanguage } from "./i18n";
import { setRegion } from "./region";

const initial = devicePreferences();
setRegion(initial.region);
void i18n.changeLanguage(resolveLanguage("system", initial.tags));

export function LocalizationProvider({ children }: PropsWithChildren) {
  const preference = useLocalDatasetStore(state => state.dataset?.preferences.language ?? "system");
  const [device, setDevice] = useState(initial);
  useEffect(() => {
    const refresh = () => setDevice(devicePreferences());
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("languagechange", refresh);
    return () => { subscription.remove(); if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("languagechange", refresh); };
  }, []);
  useEffect(() => {
    setRegion(device.region);
    const language = resolveLanguage(preference, device.tags);
    void i18n.changeLanguage(language);
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [device, preference]);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
