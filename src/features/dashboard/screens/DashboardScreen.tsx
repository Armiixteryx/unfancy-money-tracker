import { AppScreen, EmptyState } from "../../../ui/AppScreen";

export function DashboardScreen() {
  return (
    <AppScreen eyebrow="This month" title="Dashboard">
      <EmptyState
        title="No transactions yet"
        description="Add your first income or expense to see your remaining budget and monthly picture."
      />
    </AppScreen>
  );
}

