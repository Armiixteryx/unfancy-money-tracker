import { AppScreen, EmptyState } from "../../../ui/AppScreen";

export function SettingsScreen() {
  return (
    <AppScreen eyebrow="Preferences and privacy" title="Settings">
      <EmptyState
        title="Your preferences live here"
        description="Base currency, theme, local-data controls, categories, exchange rates, and optional sync will appear here."
      />
    </AppScreen>
  );
}

