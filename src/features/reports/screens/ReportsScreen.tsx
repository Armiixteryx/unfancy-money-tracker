import { AppScreen, EmptyState } from "../../../ui/AppScreen";

export function ReportsScreen() {
  return (
    <AppScreen eyebrow="Factual summaries" title="Reports">
      <EmptyState
        title="No report data yet"
        description="Add more transactions to see monthly trends and category breakdowns."
      />
    </AppScreen>
  );
}

